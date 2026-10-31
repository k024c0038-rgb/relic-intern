import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadShareData, type ShareType } from "@/lib/share/data";
import { siteUrl } from "@/lib/utils";
import { SharePanel } from "@/components/share-panel";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ type?: string }>;

const shareType = (t?: string): ShareType => (t === "post" ? "post" : "plan");

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const type = shareType((await searchParams).type);
  const data = await loadShareData(type, id);
  if (!data) return {};
  const image = `${siteUrl()}/share/${id}/image?type=${type}`;
  return {
    title: data.title,
    description: data.subtitle,
    openGraph: { title: data.title, description: data.subtitle, images: [{ url: image, width: 1080, height: 1350 }] },
    twitter: { card: "summary_large_image", title: data.title, images: [image] },
  };
}

export default async function SharePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const type = shareType((await searchParams).type);
  const t = await getTranslations("share");
  const data = await loadShareData(type, id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Link href={data.pagePath} className="text-sm underline">
        ← {data.title}
      </Link>
      <SharePanel
        imageBase={`/share/${id}/image?type=${type}`}
        pageUrl={`${siteUrl()}/share/${id}?type=${type}`}
        title={data.title}
        photos={data.photos}
      />
    </div>
  );
}
