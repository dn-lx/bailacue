// Browser IndexedDB entries have stable keys rather than phone filesystem names.
export async function prepareNamedCopy(
  uri: string,
  _name: string,
  _identity: string,
) {
  return uri;
}
