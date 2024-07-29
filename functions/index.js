const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendReportNotification = functions.firestore
  .document('users/{docId}/userUSG/{usgId}')
  .onUpdate(async (change, context) => {
    const oldUserUSG = change.after.data();
    const previousUserUSG = change.before.data();
    console.log('Updated');

    if (oldUserUSG.report === previousUserUSG.report) {
      return;
    }

    const userId = context.params.docId;
    if (!userId) {
      console.log(
        'No userId found in the USG document. Skipping notification.'
      );
      return;
    }

    try {
      const userDoc = await admin
        .firestore()
        .collection('users')
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        console.log(
          `User document ${userId} not found. Skipping notification.`
        );
        return;
      }
      const fcmTokens = userDoc.data().fcmTokens;
      if (fcmTokens.length === 0) {
        console.log(
          `No FCM token found for user ${userId}. Skipping notification.`
        );
        return;
      }

      const payload = {
        token: fcmTokens[0],
        notification: {
          title: 'USG Report Updated',
          body: 'Your USG report has been Acknowledged.',
        },
      };

      await admin.messaging().send(payload);
      console.log(`Notification sent successfully to user ${userId}`);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
    return null;
  });

exports.sendApplicationNotification = functions.firestore
  .document('clinics/{clinicId}/usg/{usgId}')
  .onCreate(async (snapshot, context) => {
    const usgId = context.params.usgId;
    const usgData = snapshot.data();
    console.log('Created');

    const userId = usgData.userId;
    if (!userId) {
      console.log(
        'No userId found in the USG document. Skipping notification.'
      );
      return;
    }

    try {
      const userDoc = await admin
        .firestore()
        .collection('users')
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        console.log(
          `User document ${userId} not found. Skipping notification.`
        );
        return;
      }

      const fcmTokens = userDoc.data().fcmTokens;
      if (fcmTokens.length === 0) {
        console.log(
          `No FCM token found for user ${userId}. Skipping notification.`
        );
        return;
      }

      const payload = {
        token: fcmTokens[0],
        notification: {
          title: 'New USG Report',
          body: `A new USG report (${usgId}) is created.`,
        },
      };
      await admin.messaging().send(payload);
      console.log(`Notification sent successfully to user ${userId}`);
    } catch (error) {
      console.error('Error sending notification:', error);
    }

    return null;
  });
