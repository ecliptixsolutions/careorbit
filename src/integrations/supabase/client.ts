/* eslint-disable @typescript-eslint/no-explicit-any */
// Temporary compatibility bridge: browser traffic goes to the Hostinger API only.
const base = import.meta.env.VITE_API_BASE_URL || "";
const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  return response.ok
    ? { ...body, error: null }
    : {
        data: null,
        error: { message: body.error?.message || "Request failed", status: response.status },
      };
};
const listeners = new Set<(event: string, session: any) => void>();
const notify = (event: string, session: any) =>
  listeners.forEach((listener) => listener(event, session));
class Query {
  private action = "select";
  private filters: any[] = [];
  private payload: any;
  private sort: any;
  private take: any;
  private wantsCount: any;
  constructor(private table: string) {}
  select(_columns = "*", options: any = {}) {
    this.action = "select";
    this.wantsCount = options.count;
    return this;
  }
  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }
  neq(column: string, value: any) {
    this.filters.push({ column, value, op: "neq" });
    return this;
  }
  is(column: string, value: any) {
    this.filters.push({ column, value, op: "is" });
    return this;
  }
  in(column: string, value: any[]) {
    this.filters.push({ column, value, op: "in" });
    return this;
  }
  order(column: string, options: any = {}) {
    this.sort = { column, ...options };
    return this;
  }
  limit(value: number) {
    this.take = value;
    return this;
  }
  insert(data: any) {
    this.action = "insert";
    this.payload = data;
    return this;
  }
  update(data: any) {
    this.action = "update";
    this.payload = data;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  upsert(data: any) {
    this.action = "upsert";
    this.payload = data;
    return this;
  }
  async run() {
    return request(`/api/data/${this.table}`, {
      method: "POST",
      body: JSON.stringify({
        action: this.action,
        filters: this.filters,
        data: this.payload,
        order: this.sort,
        limit: this.take,
        count: this.wantsCount,
      }),
    });
  }
  then(resolve: any, reject: any) {
    return this.run().then(resolve, reject);
  }
  async single() {
    const result = await this.run();
    return {
      ...result,
      data: result.data?.[0] ?? null,
      error: result.error || (result.data?.length ? null : { message: "No rows found" }),
    };
  }
  async maybeSingle() {
    const result = await this.run();
    return { ...result, data: result.data?.[0] ?? null };
  }
}
export const supabase: any = {
  from: (table: string) => new Query(table),
  auth: {
    async getSession() {
      const result = await request("/api/auth/me");
      return { data: { session: result.session || null }, error: result.error };
    },
    async getUser() {
      const result = await request("/api/auth/me");
      return { data: { user: result.user || null }, error: result.error };
    },
    onAuthStateChange(listener: any) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signInWithPassword(input: any) {
      const result = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      notify("SIGNED_IN", result.session || null);
      return { data: result, error: result.error };
    },
    async signUp(input: any) {
      const result = await request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          full_name: input.options?.data?.full_name,
          organization: input.options?.data?.organization,
          phone: input.options?.data?.phone,
          role: input.options?.data?.role,
        }),
      });
      return { data: result, error: result.error };
    },
    async signOut() {
      const result = await request("/api/auth/logout", { method: "POST" });
      notify("SIGNED_OUT", null);
      return { error: result.error };
    },
    async updateUser(input: any) {
      const result = await request("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return { data: result, error: result.error };
    },
    async resetPasswordForEmail() {
      return {
        error: { message: "Password reset email requires a configured outbound mail provider." },
      };
    },
    async exchangeCodeForSession() {
      return { error: { message: "Invalid recovery link." } };
    },
    async setSession() {
      return { error: { message: "External sessions are not supported." } };
    },
  },
  rpc: async () => ({
    data: null,
    error: { message: "This operation must be migrated to a server transaction." },
  }),
  functions: {
    invoke: async () => ({
      data: null,
      error: { message: "This operation must be migrated to the Hostinger API." },
    }),
  },
  storage: {
    from: () => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `${base}/uploads/${path}` } }),
      upload: async () => ({ error: { message: "Use /api/uploads." } }),
      remove: async () => ({ error: null }),
    }),
  },
};
