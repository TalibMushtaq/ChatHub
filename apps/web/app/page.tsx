import "./landing.css";
import { MascotDefs } from "../components/landing/Mascot";
import { LandingNavbar } from "../components/landing/LandingNavbar";
import { HeroSection } from "../components/landing/HeroSection";
import { PositioningSection } from "../components/landing/PositioningSection";
import { FeaturesSection } from "../components/landing/FeaturesSection";
import { PersonalitySection } from "../components/landing/PersonalitySection";
import { CTABand } from "../components/landing/CTABand";
import { LandingFooter } from "../components/landing/LandingFooter";

export default function HomePage() {
  return (
    <div className="landing">
      <MascotDefs />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <LandingNavbar />
      <main id="main">
        <HeroSection />
        <PositioningSection />
        <FeaturesSection />
        <PersonalitySection />
        <CTABand />
      </main>
      <LandingFooter />
    </div>
  );
}
