import * as SecureStore from "expo-secure-store";
export const vault = {
  get: (key: string) => SecureStore.getItemAsync(`bailacue.${key}`),
  set: (key: string, value: string) =>
    SecureStore.setItemAsync(`bailacue.${key}`, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: (key: string) => SecureStore.deleteItemAsync(`bailacue.${key}`),
};
