const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyB_I4GxtSiRLXJlqmW8nEHMiB1_SqXehLc",
  authDomain: 'ultrasonic-clinic.firebaseapp.com',
  projectId: 'ultrasonic-clinic',
  storageBucket: 'ultrasonic-clinic.appspot.com',
  messagingSenderId: '400364342771',
  appId: '1:400364342771:web:d6556aaf3a1272ee135686',
  measurementId: 'G-3WTKCK2NGS',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
exports.auth = auth;
