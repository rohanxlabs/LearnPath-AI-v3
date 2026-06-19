// Client-side simulated Supabase Client
// Connects to our persistent full-stack Express backend routes

async function safeJson(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (text.trim().startsWith("<!doctype") || text.trim().startsWith("<html") || text.trim().startsWith("<!DOCTYPE")) {
      throw new Error("Express API is currently offline or unreachable (returned HTML response).");
    }
    throw new Error(`Expected JSON but received response of type: ${res.headers.get("content-type") || "unknown"}`);
  }
  return await res.json();
}

class SupabaseQueryBuilder {
  private table: string;
  private filters: { column: string; value: any }[] = [];

  constructor(table: string) {
    this.table = table;
  }

  private getUserEmail() {
    const userEmail = localStorage.getItem('learnpath_user_email') || localStorage.getItem('learnpath_authenticated_email');
    if (!userEmail) {
      throw new Error('No authenticated user email is available for persistence.');
    }
    return userEmail;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  async select(columns: string = '*') {
    try {
      const userEmail = this.getUserEmail();
      const url = `/api/supabase/select?table=${this.table}&userEmail=${encodeURIComponent(userEmail)}&filters=${encodeURIComponent(JSON.stringify(this.filters))}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await safeJson(res);
      return { data, error: null };
    } catch (err: any) {
      console.error(`Supabase simulation error selecting from ${this.table}:`, err.message || err);
      return { data: null, error: err };
    }
  }

  async insert(rowOrRows: any) {
    try {
      const userEmail = this.getUserEmail();
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const res = await fetch(`/api/supabase/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: this.table, userEmail, rows })
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await safeJson(res);
      return { data, error: null };
    } catch (err: any) {
      console.error(`Supabase simulation error inserting to ${this.table}:`, err.message || err);
      return { data: null, error: err };
    }
  }

  async update(updates: any) {
    try {
      const userEmail = this.getUserEmail();
      const res = await fetch(`/api/supabase/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: this.table, userEmail, updates, filters: this.filters })
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await safeJson(res);
      return { data, error: null };
    } catch (err: any) {
      console.error(`Supabase simulation error updating ${this.table}:`, err.message || err);
      return { data: null, error: err };
    }
  }

  async upsert(rowOrRows: any) {
    try {
      const userEmail = this.getUserEmail();
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const res = await fetch(`/api/supabase/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: this.table, userEmail, rows })
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await safeJson(res);
      return { data, error: null };
    } catch (err: any) {
      console.error(`Supabase simulation error upserting ${this.table}:`, err.message || err);
      return { data: null, error: err };
    }
  }
}

export const supabase = {
  from: (table: string) => {
    return new SupabaseQueryBuilder(table);
  }
};
