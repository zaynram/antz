# Firebase Deployment Setup Guide

This guide will help you configure automatic deployment to Firebase Hosting using GitHub Actions.

## Prerequisites

- A Firebase project (already configured: `antz-antz`)
- GitHub repository with admin access
- Firebase CLI installed locally (optional, for manual deployments)

## Step 1: Generate Firebase Service Account

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **antz-antz**
3. Click on the gear icon (⚙️) → **Project Settings**
4. Navigate to the **Service Accounts** tab
5. Click **Generate New Private Key**
6. A JSON file will be downloaded - keep this file secure!

## Step 2: Add Secret to GitHub

1. Go to your GitHub repository: `https://github.com/zaynram/antz`
2. Click on **Settings** (repository settings, not your profile)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Configure the secret:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT_ANTZ_ANTZ`
   - **Value**: Paste the entire contents of the JSON file from Step 1
6. Click **Add secret**

## Step 3: Deploy

Once the secret is configured, deployment is automatic:

### Production Deployment
- Push changes to the `main` branch
- GitHub Actions will automatically build and deploy to Firebase Hosting
- View the deployment status in the **Actions** tab of your repository

### Preview Deployment
- Create a pull request to the `main` branch
- GitHub Actions will create a preview deployment
- A comment will be added to the PR with the preview URL

## Manual Deployment (Alternative)

If you prefer to deploy manually:

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Login to Firebase (first time only)
npx firebase login

# Deploy
npx firebase deploy --only hosting
```

## Deployment URLs

- **Production**: `https://antz-antz.web.app` or `https://antz-antz.firebaseapp.com`
- **Preview**: Automatically generated for each PR

## Troubleshooting

### Deployment fails with authentication error
- Verify the `FIREBASE_SERVICE_ACCOUNT_ANTZ_ANTZ` secret is correctly set
- Ensure the JSON content is complete and valid
- Check that the service account has the necessary permissions

### Build fails
- Review the build logs in GitHub Actions
- Ensure all dependencies are correctly specified in `package.json`
- Test the build locally: `npm run build`

### Changes not appearing
- Clear your browser cache
- Check that you're viewing the correct URL
- Verify the deployment completed successfully in GitHub Actions

## Security Notes

- Never commit the service account JSON file to version control
- The `.gitignore` file already excludes sensitive files
- Rotate service account keys periodically for security
- Only grant necessary permissions to the service account

## Additional Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Firebase GitHub Action](https://github.com/FirebaseExtended/action-hosting-deploy)
