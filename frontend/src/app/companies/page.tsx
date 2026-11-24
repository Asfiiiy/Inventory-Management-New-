import { redirect } from "next/navigation";

/** Legacy route — company Office IT has no Companies directory; Admin clients live under /admin. */
export default function CompaniesRedirectPage() {
  redirect("/dashboard");
}
