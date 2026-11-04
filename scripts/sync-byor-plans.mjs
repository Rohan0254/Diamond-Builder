import { PrismaClient } from "@prisma/client";
import { PLANS, planToRecord } from "../app/lib/plans.js";
const prisma = new PrismaClient();
try {
  await prisma.$transaction([
    ...PLANS.map((plan,index) => prisma.plan.upsert({where:{key:plan.key},create:planToRecord(plan,index),update:planToRecord(plan,index)})),
    prisma.plan.updateMany({where:{key:{notIn:PLANS.map(plan => plan.key)}},data:{active:false}})
  ]);
  console.log("BYOR plans synchronized: Free, Basic, Advance (USD).");
} finally { await prisma.$disconnect(); }
