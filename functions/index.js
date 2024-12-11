const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firebase = require("firebase/auth");
const firebaseAuth = require("./firebase");
admin.initializeApp();

const openaiImport = async () => {
  const { OpenAI } = await import("openai");
  return { OpenAI };
};

const nodeFetchImport = async () => {
  const { default: fetch } = await import("node-fetch");
  return fetch;
};

exports.sendReportNotification = functions.firestore
  .document("users/{docId}/userUSG/{usgId}")
  .onUpdate(async (change, context) => {
    const oldUserUSG = change.after.data();
    const previousUserUSG = change.before.data();
    console.log("Updated");

    if (oldUserUSG.report === previousUserUSG.report) {
      return;
    }

    const userId = context.params.docId;
    if (!userId) {
      console.log(
        "No userId found in the USG document. Skipping notification."
      );
      return;
    }

    try {
      const userDoc = await admin
        .firestore()
        .collection("users")
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
          title: "USG Report Updated",
          body: "Your USG report has been Acknowledged.",
        },
      };

      await admin.messaging().send(payload);
      console.log(`Notification sent successfully to user ${userId}`);
    } catch (error) {
      console.error("Error sending notification:", error);
    }
    return null;
  });

exports.sendNewUSGNotification = functions.firestore
  .document("clinics/{clinicId}/usg/{usgId}")
  .onCreate(async (snapshot, context) => {
    const clinicId = context.params.clinicId;
    const usgId = context.params.usgId;
    const usgData = snapshot.data();

    console.log("USG document created:", usgId);

    const userId = usgData.userId;

    console.log(clinicId);
    if (!userId) {
      console.log(
        "No userId found in the USG document. Skipping notification."
      );
      return;
    }

    try {
      const userQuerySnapshot = await admin
        .firestore()
        .collection("users")
        .where("clinics", "array-contains", clinicId.toString())
        .where("role", "==", "clinic")
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
            title: "New USG Report",
            body: `A new USG report (${usgId}) has been created.`,
          },
        };
      });

      await admin.messaging().sendEach(payloads);
      console.log(`Notification sent successfully to user ${userDoc.uid}`);
    } catch (error) {
      console.error("Error sending notification:", error);
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
    console.error("Error creating user:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.modifyTags = functions.https.onCall(async (data, context) => {
  const { subjectData, referenceTags } = data;
  const { OpenAI } = await openaiImport();
  const openai = new OpenAI({
    apiKey: "API_KEY",
  });

  try {
    const newTags = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that categorizes and suggests relevant tags for educational subjects.",
        },
        {
          role: "user",
          content: `Here is a the subject name with their current tags:
          ${subjectData.name} : ${subjectData.tags.join(", ")}
          
          Use this reference tag list:
          ${referenceTags.join(
            ", "
          )} to add one or more relevant tags to the given subject and make sure to not provide duplicate tags which is given in input.

          Provide only the new Tags as list format like 1.newTag1 2.newTag2 etc. Also double check the new tags that you are providing should be from the reference list.

          **Note**:For example robotic subject is in the list and you should be able to add tags from the reference list like AI, Computer Science etc, like this do double check.
          `,
        },
      ],
      model: "gpt-3.5-turbo",
    });

    const newCategories = newTags.choices[0].message.content
      .trim()
      .split("\n")
      .filter(Boolean);

    return { newCategories };
  } catch (e) {
    console.log("Error in API call:", e);
    return { error: e };
  }
});

exports.suggestSuperCategoryIndividual = functions.https.onCall(
  async (data, context) => {
    const { category, superCategories } = data;
    const { OpenAI } = await openaiImport();
    const openai = new OpenAI({
      apiKey: "API_KEY",
    });

    try {
      const newSuperCategories = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that categorizes and suggests relevant super categories from the given list",
          },
          {
            role: "user",
            content: `
          I have this category : ${category}, and some super categories : ${superCategories}. Return me the super categories that can associate with the given category.
            **Important**:  Return only the super categories from the provided list in the format 1.ex1 2.ex2 etc and do not provide any extra content except the list. Make sure there is no duplicates. If you could not find any super category then return empty list.
          `,
          },
        ],
        model: "gpt-3.5-turbo",
      });

      const suggestedSuperCategories =
        newSuperCategories.choices[0].message.content
          .trim()
          .split("\n")
          .filter(Boolean);

      return { suggestedSuperCategories };
    } catch (e) {
      console.error("Error suggesting categories:", e);
      throw new functions.https.HttpsError(
        "internal",
        "Error suggesting categories"
      );
    }
  }
);

exports.suggestNewSubSubjects = functions.https.onCall(
  async (data, context) => {
    const { subject, existingSubSubjects } = data;
    const { OpenAI } = await openaiImport();

    const openai = new OpenAI({
      apiKey: "API_KEY",
    });

    try {
      const prompt = `
        I have a subject called "${subject}". There can be sub-subjects under this subject, such as "${existingSubSubjects.join(
        ","
      )}". Please suggest up to 5 new sub-subjects for "${subject}" that are distinct from the provided sub-subjects. 

        Format the response in the following way:
        1. Sub Subject 1
        2. Sub Subject 2
        3. Sub Subject 3
        4. Sub Subject 4
        5. Sub Subject 5

        Do not include duplicates or similar topics from the provided sub-subjects. The suggestions should be creative yet relevant to the main subject.
      `;

      const response = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that categorizes and suggests relevant super categories from the given list",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "gpt-3.5-turbo",
      });
      const suggestions = response.choices[0].message.content
        .trim()
        .split("\n")
        .filter(Boolean);

      return { suggestions };
    } catch (e) {
      console.error("Error suggesting Sub Subjects:", e);
      throw new functions.https.HttpsError(
        "internal",
        "Error suggesting categories"
      );
    }
  }
);

exports.suggestCategories = functions.https.onCall(async (data, context) => {
  const { superCategory, existingCategories, suggestions } = data;
  const { OpenAI } = await openaiImport();

  const openai = new OpenAI({
    apiKey: "API_KEY",
  });

  try {
    const newCategories = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: `
          Here is a list of existing categories: ${existingCategories.join(
            ", "
          )}. 
          Please suggest exactly 5 **new** categories that fall under the "${superCategory}" category. 
          **Do not include any categories that overlap in meaning, context, or content** with the items listed in "${suggestions}." 

          Important:
          1. Ensure that **each suggested category is unique, distinct from all categories listed, and unrelated to any context in ${suggestions}**.
          2. Always respond only with a list of names, starting with the index for each item from 1. 
            
          Example response format:
          1. NewCategory1  
          2. NewCategory2  
          3. NewCategory3  
          4. NewCategory4  
          5. NewCategory5
          `,
        },
      ],
      model: "gpt-3.5-turbo",
    });

    const suggestedCategories = newCategories.choices[0].message.content
      .trim()
      .split("\n")
      .filter(Boolean);

    return { suggestedCategories };
  } catch (e) {
    console.error("Error suggesting categories:", e);
    throw new functions.https.HttpsError(
      "internal",
      "Error suggesting categories"
    );
  }
});

exports.superCategorySuggestion = functions.https.onCall(
  async (data, context) => {
    const { OpenAI } = await openaiImport();
    const openai = new OpenAI({
      apiKey: "API_KEY",
    });

    const { existingData } = data;
    try {
      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant.",
          },
          {
            role: "user",
            content: `
            I am building an online course catalog with a two-level category hierarchy. For each course, there is a main category (superCategory) and several subcategories (secondLevelCategories). 
            
            Below is a list of superCategories that already exist. Your task is to suggest **5 new and unique** superCategories (without any subcategories). **Do not include** any of the superCategory names in the existing data provided:
            
            Existing SuperCategories: ${JSON.stringify(existingData)}
            
            Please return **only new superCategories** in JSON format without any additional text:
            
            [
              { "superCategory": "Suggested Category 1" },
              { "superCategory": "Suggested Category 2" },
              ...
            ]
            
            Important:
            1. Each superCategory should cover a distinct area of study typically found in educational courses.
            2. Ensure that all suggestions are new and do not overlap with the names in the existing data.
            3. Do not include any introductory or explanatory text; only return the JSON list as shown above.
            `,
          },
        ],
      });

      let responseData = chatCompletion.choices[0].message.content;

      responseData = responseData.replace(/```json\n|\n```/g, "").trim();

      let suggestions;
      try {
        suggestions = JSON.parse(responseData);
      } catch (e) {
        console.error("Error parsing JSON:", e);
        return { error: "Cannot be parsed", data: responseData };
      }

      return { suggestions };
    } catch (e) {
      console.error("Error suggesting super categories:", e);
      throw new functions.https.HttpsError(
        "internal",
        "Error suggesting super categories"
      );
    }
  }
);

exports.nameSuggestion = functions.https.onCall(async (data, context) => {
  const { OpenAI } = await openaiImport();

  const openai = new OpenAI({
    apiKey: "API_KEY",
  });
  const { existingCategories, courseNames } = data;
  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: `
          I am building an online course catalog with a two-level category hierarchy. Each course has a main category (superCategory) and several subcategories (secondLevelCategories). For each course, we need a unique name, focusing on diverse areas of study typically found in educational courses.
          
          Here is the existing category data, which should not be duplicated in the suggestions:
          
          Existing Categories: ${JSON.stringify(existingCategories)}
          
          Existing Course Names: ${courseNames}
          
          Please suggest new and unique course names that are not present in the Existing Course Names. Each response should be in the following JSON format as a **single array** containing 5 items:
          
          [
            {
              "name": "course name",
              "hierarchy": {
                "superCategory": "name",
                "secondLevelCategories": ["subcategory1", "subcategory2", ...]
              }
            },
            ...
          ]
          
          **Important**: 
          - Use only the secondLevelCategories associated with each superCategory as defined in existingCategories; do not add or invent new second-level categories.
          - Ensure that each course name is unique and follows the provided hierarchical structure exactly as shown above. Return exactly 5 items in the array, sorted alphabetically by course name, **without any additional text**.
          `,
        },
      ],
      model: "gpt-3.5-turbo",
    });

    let responseData = chatCompletion.choices[0].message.content;

    responseData = responseData.replace(/```json\n|\n```/g, "").trim();

    if (!responseData.startsWith("[")) {
      responseData = `[${responseData.replace(/\n}/g, "},\n").trim()}]`;
    }

    let newSuggestions;
    try {
      newSuggestions = JSON.parse(responseData);
    } catch (e) {
      console.error("Error parsing JSON:", e);
      return { error: "Cannot be parsed", data: responseData };
    }

    return { newSuggestions };
  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong!");
  }
});

exports.generateImages = functions.https.onCall(async (data, context) => {
  const { OpenAI } = await openaiImport();

  const openai = new OpenAI({
    apiKey: "API_KEY",
  });
  const { prompt } = data;

  try {
    const response = await openai.images.generate({
      prompt: prompt,
      n: 1,
      model: "dall-e-2",
      size: "512x512",
      response_format: "b64_json",
    });

    const imageBase64 = response.data[0].b64_json;

    return {
      prompt,
      summary: "Here is the generated image in base64 format:",
      image: imageBase64,
    };
  } catch (error) {
    console.error("Error generating image:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate image"
    );
  }
});

exports.generateMultipleImages = functions.https.onCall(
  async (data, context) => {
    const { OpenAI } = await openaiImport();

    const openai = new OpenAI({
      apiKey: "API_KEY",
    });
    const { prompt } = data;

    try {
      const response = await openai.images.generate({
        prompt: prompt,
        n: 4,
        model: "dall-e-2",
        size: "512x512",
        response_format: "b64_json",
      });

      const imageUrls = response.data.map(
        (imageData) => `data:image/png;base64,${imageData.b64_json}`
      );

      return {
        prompt,
        imageUrls,
        summary: "Here are the generated images in base64 format:",
      };
    } catch (error) {
      console.error("Error generating images:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to generate images"
      );
    }
  }
);

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
          status: "success",
          message: "Email verification link sent to " + link,
        };
      }
    } catch (error) {
      console.log("Error sending email verification:", error);
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Error sending email verification."
      );
    }
  }
);
