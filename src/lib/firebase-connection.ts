
let isFirebaseConnected = true;

export const getFirebaseConnectionStatus = () => isFirebaseConnected;

export const toggleFirebaseConnection = () => {
  isFirebaseConnected = !isFirebaseConnected;
};
