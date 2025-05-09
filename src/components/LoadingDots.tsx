import React from 'react';
import { motion } from "framer-motion";

interface LoadingDotsProps {
  color?: string;
  size?: number;
  gap?: number;
}

const LoadingDots: React.FC<LoadingDotsProps> = ({
  color = "#FFFFFF",
  size = 6,
  gap = 8
}) => {
  const dotVariants = {
    pulse: {
      scale: [1, 1.3, 1],
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  return (
    <motion.div
      animate="pulse"
      transition={{ staggerChildren: 0.15 }}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: `${gap}px`,
      }}
    >
      <motion.div
        className="dot"
        variants={dotVariants}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          backgroundColor: color,
          willChange: 'transform',
        }}
      />
      <motion.div
        className="dot"
        variants={dotVariants}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          backgroundColor: color,
          willChange: 'transform',
        }}
      />
      <motion.div
        className="dot"
        variants={dotVariants}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          backgroundColor: color,
          willChange: 'transform',
        }}
      />
    </motion.div>
  );
};

export default LoadingDots; 