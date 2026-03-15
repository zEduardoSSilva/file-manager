import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Placeholder for the function to get billing data
const getBillingData = async () => {
  // In a real scenario, you would use the Google Cloud Billing API here.
  // For now, we'll return mock data.
  console.log('Fetching billing data...');
  return {
    firestoreReads: Math.floor(Math.random() * 10000),
    firestoreWrites: Math.floor(Math.random() * 5000),
    firestoreDeletes: Math.floor(Math.random() * 1000),
    storageUsageGB: Math.random() * 100,
    functionInvocations: Math.floor(Math.random() * 2000000),
  };
};

export const updateFirebaseUsage = functions.pubsub
  .schedule('every 24 hours') // Runs once a day
  .onRun(async (context) => {
    console.log('Running daily Firebase usage update...');
    const usageData = await getBillingData();

    const db = admin.firestore();
    const usageRef = db.collection('usage').doc('dailySummary');

    try {
      await usageRef.set(usageData, { merge: true });
      console.log('Successfully updated Firebase usage data:', usageData);
    } catch (error) {
      console.error('Error updating Firebase usage data:', error);
    }
  });
