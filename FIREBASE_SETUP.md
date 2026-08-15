# Firebase setup for COS Number Check

The supplied Firebase Web configuration is in `firebase-config.js`. It is a browser configuration, not a service-account key.

## 1. Enable Firebase services

1. In Firebase Console, enable **Authentication > Sign-in method > Email/Password**.
2. Create a Firebase Authentication user for the administrator. The site accepts a full email address. For a short username such as `trust`, it appends `@uk-visa-c64c8.firebaseapp.com`.
3. Use a password with at least six characters. Do not use the previous four-character front-end password.
4. Create **Cloud Firestore** in Production mode.

## 2. Create the administrator record

1. Copy the administrator user's **UID** from Authentication > Users.
2. In Firestore, create this document manually:

   Collection: `admins`

   Document ID: the Firebase Authentication UID

   Field: `role` (string) = `admin`

## 3. Publish the rules

1. In Firestore > Rules, replace the rules with the contents of `firestore.rules` and publish.
2. Cloud Storage is not required for this Firestore-only version of the site.

## What is shared

- Any visitor who knows a COS number can retrieve only the registration status from `publicCosStatus`.
- Names and compressed test avatars stay in `cosRecords` and are visible only to the Firebase administrator.
- Do not use this application for real documents, identity records, or passport images.

Existing records in browser local storage are not migrated automatically. Sign in as the Firebase administrator and add each permitted test record again.
