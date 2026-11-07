"use client";

import { CardAiReviewScreen } from "@/features/cards";
import { useParams } from "next/navigation";

export default function CardAiReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return <CardAiReviewScreen jobId={Number(jobId)} />;
}
