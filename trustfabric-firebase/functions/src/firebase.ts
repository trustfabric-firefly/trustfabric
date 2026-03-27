import * as admin from 'firebase-admin';
import * as serviceAccount from './service-firebase.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

export const db = admin.firestore();