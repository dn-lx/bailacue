// Browser previews deliberately keep storage credentials in memory only.
const values = new Map<string, string>();
export const vault = {
  get: async (key: string) => values.get(key) ?? null,
  set: async (key: string, value: string) => {
    values.set(key, value);
  },
  remove: async (key: string) => {
    values.delete(key);
  },
};
