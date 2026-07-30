import axios from "axios";
import { cookies } from "next/headers";

export async function serverApi() {
  const cookieStore = await cookies();

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return axios.create({
    baseURL: process.env.API_URL || "http://localhost:3100/api",
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
}
