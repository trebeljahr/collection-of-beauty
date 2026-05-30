import { permanentRedirect } from "next/navigation";

type Params = { slug: string };

export default async function DropsEditionRedirect({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  permanentRedirect(`/newsletter/${slug}`);
}
