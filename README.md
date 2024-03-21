<h1 align="center">
  astro-deploy-s3-cloudfront
</h1>

A simple script to deploy astro websites to aws s3 and cloudfront

It was meant for astro but is suposed to work fine with any static files set.

It is based on the [gatsby-plugin-s3](https://www.npmjs.com/package/gatsby-plugin-s3/v/0.1.2)

Just clone this repo, replace the values in the code:

```
const bucketName = "s3-bucket-name";

const localFilesDir = "path-to-local-dist";

const cloudFrontDistributionId = "cloudfront-distribution-id";
```

and execute the script:

```
node deploy.js
```

You need to have aws credentials seted in your machine.

If you are using another profile than the default use this command to execute the script:

```
AWS_PROFILE=profile node deploy.js
```

The script will sync the files from your local files dir with the s3 bucket and create invalidations for each uploaded file in the cloudfront.

You may check the state of the invalidation with the command:

```
aws cloudfront list-invalidations --distribution-id EDFDVBD6EXAMPLE
```

As soon as you see "Status": "Completed" in your invalidation list you can verify the new version of your website in the browser.


## AWS CREDENTIALS

- Get your AWS Credentials for IAM user: https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html






