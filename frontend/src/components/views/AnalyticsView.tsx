import { SalesCharts } from "../SalesCharts";
import { KPICards } from "../KPICards";
import { GlobalFilters } from "../../App";
import { motion } from "motion/react";
interface AnalyticsViewProps {
  globalFilters?: GlobalFilters;
}

export function AnalyticsView({ globalFilters }: AnalyticsViewProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 10
      }
    }
  };

  return (
    <motion.div>
      <motion.div variants={itemVariants}>
        <h1>Advanced Analytics</h1>
        <KPICards globalFilters={globalFilters} />
      </motion.div>
      <motion.div variants={itemVariants}>
        <SalesCharts globalFilters={globalFilters} />
      </motion.div>
    </motion.div>
  );
}
