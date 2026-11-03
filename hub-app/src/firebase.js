import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDfGpxwKeVwsgqoY7kBV89Ms6d28--wAHA',
  authDomain: 'moto-dc-6e049.firebaseapp.com',
  projectId: 'moto-dc-6e049',
  storageBucket: 'moto-dc-6e049.firebasestorage.app',
  messagingSenderId: '278997563',
  appId: '1:278997563:web:ea273440de25fcf829e5b1',
  measurementId: 'G-CQSSJ222H0'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, 'asia-south1');
