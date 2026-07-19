import { LandingHeader } from "@/components/landing/landing-header";
import { Hero } from "@/components/landing/hero";
import { ChannelStrip } from "@/components/landing/channel-strip";
import { ProblemSolution } from "@/components/landing/problem-solution";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { CapabilitiesSection } from "@/components/landing/capabilities-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ChannelDemo } from "@/components/landing/channel-demo";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { UseCases } from "@/components/landing/use-cases";
import { PricingSection } from "@/components/landing/pricing-section";
import { TrustSection } from "@/components/landing/trust-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function Home() {
  return (
    <div className="font-landing min-h-screen bg-white text-brand-ink">
      <LandingHeader />
      <Hero />
      <ChannelStrip />
      <ProblemSolution />
      <FeatureShowcase />
      <CapabilitiesSection />
      <HowItWorks />
      <ChannelDemo />
      <IntegrationsSection />
      <UseCases />
      <PricingSection />
      <TrustSection />
      <FaqSection />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
