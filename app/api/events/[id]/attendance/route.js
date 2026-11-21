// Canonical event attendance door route.
// Handles door check-in via QR code or student ID.
// Authority is verified server-side based on capability check_in_attendees.
import { POST as handler } from "@/app/api/admin/events/[id]/attendance/route";

export async function POST(request, context) {
  return handler(request, context);
}
