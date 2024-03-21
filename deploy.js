#!/usr/bin/env node

const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const {
  CloudFrontClient,
  CreateInvalidationCommand,
} = require("@aws-sdk/client-cloudfront");
const { Upload } = require("@aws-sdk/lib-storage");
const klaw = require("klaw");
const asyncModule = require("async");
const pathModule = require("path");
const utilModule = require("util");
const fsModule = require("fs");
const cryptoModule = require("crypto");
const mimeModule = require("mime/lite");
const streamToPromiseModule = require("stream-to-promise");

const promisifiedParallelLimit = utilModule.promisify(
  asyncModule.parallelLimit
);

const bucketName = "s3-bucket-name";

const localFilesDir = "path-to-local-dist";

const cloudFrontDistributionId = "cloudfront-distribution-id";

const s3Client = new S3Client({
  region: "us-west-2",
});
const cloudFrontClient = new CloudFrontClient({});

console.log(`Retrieving bucket ${bucketName} info.`);

const listAllObjects = async () => {
  const list = [];

  const command = new ListObjectsV2Command({ Bucket: bucketName });
  let token;
  do {
    const response = await s3Client.send(command);
    if (response.Contents) {
      list.push(...response.Contents);
    }
    token = response.NextContinuationToken;
  } while (token);

  return list;
};

const createSafeS3Key = (key) => {
  if (pathModule.sep === "\\") {
    return key.replace(/\\/g, "/");
  }
  return key;
};

const startProcess = async () => {
  const uploadQueue = [];

  const uploadFiles = ["/"];

  const objects = await listAllObjects();

  const keyToETagMap = objects.reduce((acc, curr) => {
    if (curr.Key && curr.ETag) {
      acc[curr.Key] = curr.ETag;
    }
    return acc;
  }, {});

  const publicDir = pathModule.resolve(localFilesDir);

  const isKeyInUse = {};

  const stream = klaw(publicDir);

  stream.on("data", ({ path, stats }) => {
    if (!stats.isFile()) {
      return;
    }
    uploadQueue.push(
      asyncModule.asyncify(async () => {
        let fileMimeType;
        let key = createSafeS3Key(pathModule.relative(publicDir, path));
        const readStream = fsModule.createReadStream(path);
        const hashStream = readStream.pipe(
          cryptoModule.createHash("md5").setEncoding("hex")
        );
        const data = await streamToPromiseModule(hashStream);
        const tag = `"${data}"`;
        const objectUnchanged = keyToETagMap[key] === tag;
        isKeyInUse[key] = true;
        if (!objectUnchanged) {
          uploadFiles.push(`/${key}`);
          try {
            const uploadParams = Object.assign(
              {
                Bucket: bucketName,
                Key: key,
                Body: fsModule.createReadStream(path),
                ACL: "public-read",
                ContentType:
                  (fileMimeType = mimeModule.getType(path)) !== null &&
                  fileMimeType !== void 0
                    ? fileMimeType
                    : "application/octet-stream",
              },
              { CacheControl: "public, max-age=31536000, immutable" }
            );
            console.log({ uploadParams });
            const parallelUploads3 = new Upload({
              client: s3Client,
              params: uploadParams,
            });
            parallelUploads3.on("httpUploadProgress", (evt) => {
              console.log(
                `Syncing... Uploading ${key} ${evt.loaded.toString()}/${evt.total.toString()}`
              );
            });
            await parallelUploads3.done();
            console.log(`Syncing...\nUploaded ${key}`);
          } catch (ex) {
            console.error(ex);
            process.exit(1);
          }
        }
      })
    );
  });

  await streamToPromiseModule(stream);
  await promisifiedParallelLimit(uploadQueue, 20);
  console.log("S3 Synced.");

  if (uploadFiles.length > 1) {
    console.log("uploadFiles");
    console.log(uploadFiles);

    console.log("Invalidating CloudFront");
    const invalidationParams = {
      DistributionId: cloudFrontDistributionId,
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: uploadFiles.length,
          Items: uploadFiles,
        },
      },
    };
    const invalidationCommand = new CreateInvalidationCommand(
      invalidationParams
    );
    try {
      const invalidationResult = await cloudFrontClient.send(
        invalidationCommand
      );
      console.log({ invalidationResult });
    } catch (ex) {
      console.error(ex);
      process.exit(1);
    }
    console.log("Invalidation complete.");
    process.exit(0);
  } else {
    console.log("No files to invalidate.");
    process.exit(0);
  }
};

startProcess();
