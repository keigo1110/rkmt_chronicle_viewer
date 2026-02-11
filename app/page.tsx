import TimelineExplorer from "@/components/timeline-explorer";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "./site";

export default function Page() {
  const siteUrl = getSiteUrl();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: siteUrl,
      description: SITE_DESCRIPTION,
      inLanguage: "ja",
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description: SITE_DESCRIPTION,
      featureList: [
        "Deep Zoom image viewer",
        "OCR text search",
        "Jump to matched text region",
        "Temporary highlight overlay",
        "Shareable query links with ?q="
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "このビューワーは何ができますか？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "高解像度の年表画像を Deep Zoom で滑らかに閲覧し、OCR テキスト検索で該当位置へ即座にジャンプできます。"
          }
        },
        {
          "@type": "Question",
          name: "検索結果に移動するにはどうすればよいですか？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "検索語を入力して Enter を押すと該当位置へ移動します。複数ヒット時は n / p キーで巡回できます。"
          }
        },
        {
          "@type": "Question",
          name: "検索状態を共有できますか？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "?q=keyword のURLで検索状態を共有できます。リンクを開くと初回表示で検索が復元されます。"
          }
        }
      ]
    }
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD improves machine readability for search and answer engines.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <TimelineExplorer />
    </>
  );
}

