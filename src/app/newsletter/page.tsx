import { permanentRedirect } from "next/navigation";

export default function NewsletterIndexRedirect() {
  permanentRedirect("/drops");
}
