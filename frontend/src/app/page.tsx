import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import Ticker from "@/components/home/Ticker";
import Categories from "@/components/home/Categories";
import Products from "@/components/home/Products";
import OfferBanner from "@/components/home/OfferBanner";

export default function Home() {
  return (
    <>
      <Header />
      <Hero />
      <Ticker />
      <Categories />
      <Products />
      <OfferBanner />
      <Footer compact />
    </>
  );
}
