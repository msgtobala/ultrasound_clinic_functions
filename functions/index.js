const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firebase = require('firebase/auth');
const firebaseAuth = require('./firebase');
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
        console.log(`User document ${userId} not found. Skipping notificatio`);
        return;
      }
      const fcmTokens = userDoc.data().fcmTokens;
      if (fcmTokens.length === 0) {
        console.log(
          ` No FCM token found for user ${userId}. Skipping notification`
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

exports.sendNewUSGNotification = functions.firestore
  .document('clinics/{clinicId}/usg/{usgId}')
  .onCreate(async (snapshot, context) => {
    const clinicId = context.params.clinicId;
    const usgId = context.params.usgId;
    const usgData = snapshot.data();

    console.log('USG document created:', usgId);

    const userId = usgData.userId;

    console.log(clinicId);
    if (!userId) {
      console.log(
        'No userId found in the USG document. Skipping notification.'
      );
      return;
    }

    try {
      const userQuerySnapshot = await admin
        .firestore()
        .collection('users')
        .where('clinics', 'array-contains', clinicId.toString())
        .where('role', '==', 'clinic')
        .get();
      console.log(userQuerySnapshot.docs[0]);

      if (userQuerySnapshot.empty) {
        console.log(
          ` No clinic users found for clinicId ${clinicId}. Skipping notification`
        );
        return;
      }

      const userDoc = userQuerySnapshot.docs[0];
      const fcmTokens = userDoc.data().fcmTokens;
      if (!fcmTokens || fcmTokens.length === 0) {
        console.log(
          `  No FCM token found for user ${userDoc.uid}. Skipping notification.`
        );
        return;
      }

      const payloads = fcmTokens.map((token) => {
        return {
          token: token,
          notification: {
            title: 'New USG Report',
            body: `A new USG report (${usgId}) has been created.`,
          },
        };
      });

      await admin.messaging().sendEach(payloads);
      console.log(`Notification sent successfully to user ${userDoc.uid}`);
    } catch (error) {
      console.error('Error sending notification:', error);
    }

    return null;
  });

exports.createUser = functions.https.onCall(async (data, context) => {
  const { email, password } = data;
  try {
    const userCredential = await firebase.createUserWithEmailAndPassword(
      firebaseAuth.auth,
      email,
      password
    );
    const user = userCredential.user;
    await firebase.sendEmailVerification(user);
    return { uid: user.uid };
    // const userRecord = await admin.auth().createUser({
    //   email: data.email,
    //   password: data.password,
    // });
    // return { uid: userRecord.uid };
  } catch (error) {
    console.error('Error creating user:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.sendKidEmailVerification = functions.https.onCall(
  async (data, context) => {
    const email = data.email;
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      console.log(email);
      if (userRecord) {
        const link = await admin.auth().generateEmailVerificationLink(email);
        console.log(link);
        return {
          status: 'success',
          message: 'Email verification link sent to ' + link,
        };
      }
    } catch (error) {
      console.log('Error sending email verification:', error);
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Error sending email verification.'
      );
    }
  }
);

// exports.sendKidEmailVerification = functions.https.onCall(
//   async (data, context) => {
//     const email = data.email;
//     try {
//       const userRecord = await admin.auth().getUserByEmail(email);
//       console.log(email);
//       if (userRecord) {
//         const link = await admin.auth().generateEmailVerificationLink(email);
//         console.log(link);
//         return {
//           status: "success",
//           message: "Email verification link sent to " + link,
//         };
//       }
//     } catch (error) {
//       console.log("Error sending email verification:", error);
//       throw new functions.https.HttpsError(
//         "failed-precondition",
//         "Error sending email verification."
//       );
//     }
//   }
// );
