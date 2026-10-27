import { Redirect } from "expo-router";
// Keep old device links useful after retiring app-account login and server sync.
export default function AccountScreen() {
  return <Redirect href="/backups" />;
}
