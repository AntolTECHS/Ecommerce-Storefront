import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";

const features = [
  { title: "Free Shipping", subtitle: "Free shipping on orders over $50", badge: "✓" },
  { title: "24/7 Support", subtitle: "Get help whenever you need it", badge: "24/7" },
  { title: "30-Day Returns", subtitle: "Easy returns within 30 days", badge: "30d" },
];

export const FeaturesSection = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let index = 0;
    const slides = container.children;
    const total = slides.length;

    const interval = setInterval(() => {
      index = (index + 1) % total;
      slides[index].scrollIntoView({ behavior: "smooth", inline: "start" });
    }, 2000); // every 2 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div
          ref={containerRef}
          className="flex md:grid md:grid-cols-3 gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth"
        >
          {features.map((feature, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-full sm:w-80 md:w-auto flex flex-col items-center p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-300 snap-start md:snap-none"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Badge className="bg-primary text-primary-foreground text-sm font-medium">
                  {feature.badge}
                </Badge>
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">{feature.title}</h3>
              <p className="text-gray-600 text-sm">{feature.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
