import { UserProfile } from "@/components/user-profile";

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserProfile userId={id} />;
}
