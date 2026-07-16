import { HOME_SPLINE_SCENE_URL } from "@/features/home/config/spline-scene";
import { HomeContent } from "@/features/home/ui/home-content";

export default function HomePage() {
  return (
    <>
      <link
        rel="preload"
        href={HOME_SPLINE_SCENE_URL}
        as="fetch"
        crossOrigin="anonymous"
      />
      <HomeContent />
    </>
  );
}
