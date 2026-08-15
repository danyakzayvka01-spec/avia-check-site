const FIREBASE_VERSION = '12.17.1';
const firebaseConfig = window.COS_FIREBASE_CONFIG;
const defaultRecord = { cos:'E4G1F8A9B2', status:'Registered' };
let firebaseApi = null;
let adminUser = null;
let pendingObjectUrl = '';

function openModal(id) { document.getElementById(id).showModal(); }
function setSyncStatus(message, type='') {
  const status=document.getElementById('syncStatus');
  status.textContent=message;
  status.className=`sync-status ${type}`;
}
function setLookupError(message) {
  const error=document.getElementById('error');
  error.textContent=message;
  error.classList.add('show');
}
function clearLookupError() { document.getElementById('error').classList.remove('show'); }
function showPublicRecord(record) {
  const grid=document.getElementById('resultGrid');
  const photo=document.getElementById('recordPhoto');
  grid.classList.add('public');
  photo.hidden=true;
  document.getElementById('recordName').textContent='Registration record';
  document.getElementById('recordTag').textContent=(record.status || 'Registered').toUpperCase();
  document.getElementById('recordCos').textContent=record.cos;
  document.getElementById('recordStatus').textContent=record.status || 'Registered';
  document.getElementById('result').classList.add('show');
}
function showAdminRecord(record) {
  const grid=document.getElementById('resultGrid');
  const photo=document.getElementById('recordPhoto');
  grid.classList.remove('public');
  document.getElementById('recordName').textContent=record.name || 'Unnamed record';
  document.getElementById('recordTag').textContent=(record.status || 'Registered').toUpperCase();
  document.getElementById('recordCos').textContent=record.cos;
  document.getElementById('recordStatus').textContent=record.status || 'Registered';
  if (typeof record.photoData==='string' && record.photoData.startsWith('data:image/')) { photo.src=record.photoData; photo.hidden=false; } else { photo.hidden=true; }
  document.getElementById('result').classList.add('show');
}
function setSignedIn(user) {
  const signedIn=Boolean(user);
  document.getElementById('adminbar').classList.toggle('show', signedIn);
  document.getElementById('guestNav').style.display=signedIn ? 'none' : 'flex';
  document.getElementById('profile').classList.toggle('show', signedIn);
  if (user) document.getElementById('profileName').textContent=(user.email || 'Administrator').split('@')[0];
}
function normalizedEmail(value) {
  const username=value.trim().toLowerCase();
  return username.includes('@') ? username : `${username}@${firebaseConfig.authDomain}`;
}
async function handleAuthState(user) {
  adminUser=null;
  if (!user || !firebaseApi) { setSignedIn(null); return; }
  try {
    const admin=await firebaseApi.getDoc(firebaseApi.doc(firebaseApi.db, 'admins', user.uid));
    if (!admin.exists()) {
      setSyncStatus('This Firebase account is not an administrator.', 'error');
      await firebaseApi.signOut(firebaseApi.auth);
      return;
    }
    adminUser=user;
    setSignedIn(user);
  } catch (error) {
    console.error(error);
    setSyncStatus('Unable to verify administrator access.', 'error');
    await firebaseApi.signOut(firebaseApi.auth);
  }
}
async function initializeFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) { setSyncStatus('Firebase configuration is missing.', 'error'); return; }
  try {
    const [appSdk, firestoreSdk, authSdk] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`)
    ]);
    const app=appSdk.initializeApp(firebaseConfig);
    firebaseApi={
      db:firestoreSdk.getFirestore(app), auth:authSdk.getAuth(app),
      doc:firestoreSdk.doc, getDoc:firestoreSdk.getDoc, writeBatch:firestoreSdk.writeBatch, serverTimestamp:firestoreSdk.serverTimestamp,
      signInWithEmailAndPassword:authSdk.signInWithEmailAndPassword, signOut:authSdk.signOut, onAuthStateChanged:authSdk.onAuthStateChanged
    };
    firebaseApi.onAuthStateChanged(firebaseApi.auth, handleAuthState);
    setSyncStatus('Secure record storage connected.', 'ready');
  } catch (error) {
    console.error(error);
    setSyncStatus('Unable to connect to record storage. Check Firebase setup.', 'error');
  }
}
async function lookup() {
  const cos=document.getElementById('cos').value.trim().toUpperCase();
  document.getElementById('result').classList.remove('show');
  if (!cos) { setLookupError('Enter a COS number.'); return; }
  if (!firebaseApi) { setLookupError('Record storage is not ready.'); return; }
  try {
    const publicSnapshot=await firebaseApi.getDoc(firebaseApi.doc(firebaseApi.db, 'publicCosStatus', cos));
    if (!publicSnapshot.exists()) {
      if (cos===defaultRecord.cos) { showPublicRecord(defaultRecord); clearLookupError(); return; }
      setLookupError('No record found.');
      return;
    }
    const publicRecord={ cos, ...publicSnapshot.data() };
    if (adminUser) {
      const fullSnapshot=await firebaseApi.getDoc(firebaseApi.doc(firebaseApi.db, 'cosRecords', cos));
      if (fullSnapshot.exists()) { showAdminRecord({ cos, ...fullSnapshot.data() }); } else { showPublicRecord(publicRecord); }
    } else {
      showPublicRecord(publicRecord);
    }
    clearLookupError();
  } catch (error) {
    console.error(error);
    setLookupError('Unable to retrieve this record.');
  }
}
async function signIn() {
  const name=document.getElementById('loginName').value;
  const password=document.getElementById('loginPass').value;
  const error=document.getElementById('loginError');
  if (!firebaseApi) { error.textContent='Firebase is not connected.'; error.classList.add('show'); return; }
  try {
    await firebaseApi.signInWithEmailAndPassword(firebaseApi.auth, normalizedEmail(name), password);
    document.getElementById('login').close();
    error.classList.remove('show');
  } catch (reason) {
    console.error(reason);
    error.textContent='Invalid administrator credentials.';
    error.classList.add('show');
  }
}
async function logout() {
  if (firebaseApi) await firebaseApi.signOut(firebaseApi.auth);
  adminUser=null;
  setSignedIn(null);
}
function preview(input) {
  const file=input.files[0];
  if (!file) return;
  const image=document.getElementById('preview');
  if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
  pendingObjectUrl=URL.createObjectURL(file);
  image.src=pendingObjectUrl;
  image.classList.add('show');
}
function preparePhoto(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl=URL.createObjectURL(file), source=new Image();
    source.onload=() => {
      const maxSide=320, scale=Math.min(1, maxSide/Math.max(source.width, source.height)), canvas=document.createElement('canvas');
      canvas.width=Math.max(1, Math.round(source.width*scale));
      canvas.height=Math.max(1, Math.round(source.height*scale));
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(sourceUrl);
      const dataUrl=canvas.toDataURL('image/jpeg', .72);
      const sizeInBytes=Math.ceil((dataUrl.length-dataUrl.indexOf(',')-1)*3/4);
      if (sizeInBytes>650*1024) { reject(new Error('Image is too large')); return; }
      resolve(dataUrl);
    };
    source.onerror=() => { URL.revokeObjectURL(sourceUrl); reject(new Error('Image processing failed')); };
    source.src=sourceUrl;
  });
}
async function addRecord() {
  const file=document.getElementById('newPhoto').files[0];
  const cos=document.getElementById('newCos').value.trim().toUpperCase();
  const name=document.getElementById('newName').value.trim();
  const button=document.getElementById('saveRecord');
  if (!/^[A-Z0-9]{1,10}$/.test(cos)) { alert('Use up to 10 letters and numbers for the COS number.'); return; }
  if (!file || !firebaseApi || !adminUser) { alert('Sign in as an administrator and select a photo before saving.'); return; }
  button.disabled=true;
  button.textContent='Saving...';
  try {
    const compressedPhoto=await preparePhoto(file);
    const batch=firebaseApi.writeBatch(firebaseApi.db);
    batch.set(firebaseApi.doc(firebaseApi.db, 'cosRecords', cos), { cos, name, status:'Registered', photoData:compressedPhoto, updatedAt:firebaseApi.serverTimestamp() });
    batch.set(firebaseApi.doc(firebaseApi.db, 'publicCosStatus', cos), { cos, status:'Registered', updatedAt:firebaseApi.serverTimestamp() });
    await batch.commit();
    document.getElementById('add').close();
    document.getElementById('newCos').value='';
    document.getElementById('newName').value='';
    document.getElementById('newPhoto').value='';
    document.getElementById('preview').removeAttribute('src');
    document.getElementById('preview').classList.remove('show');
    if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
    pendingObjectUrl='';
    document.getElementById('cos').value=cos;
    await lookup();
  } catch (error) {
    console.error(error);
    alert('Unable to save the record. Check Firebase Authentication and Firestore rules, or select a smaller photo.');
  } finally {
    button.disabled=false;
    button.textContent='Save record';
  }
}
document.getElementById('cos').addEventListener('keydown', event => { if (event.key==='Enter') lookup(); });
initializeFirebase();
