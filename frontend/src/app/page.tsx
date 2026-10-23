import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import Ticker from "@/components/home/Ticker";
import HomeCatalog from "@/components/home/HomeCatalog";
import HomeCatalogFallback from "@/components/home/HomeCatalogFallback";
import { Suspense } from "react";
import OfferBanner from "@/components/home/OfferBanner";
import ShoppingSteps from "@/components/home/ShoppingSteps";

export default function Home() {
  return (
    <>
      <Header />
      <Hero />
      <Ticker />
      <Suspense fallback={<HomeCatalogFallback/>}>
        <HomeCatalog />
      </Suspense>
      <ShoppingSteps />
      <OfferBanner />
      <Footer compact />
    </>
  );
}
