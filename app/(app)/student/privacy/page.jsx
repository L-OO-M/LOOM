import { redirect } from "next/navigation";

export default function PrivacyPage() {
  redirect("/student/settings#privacy");
}
