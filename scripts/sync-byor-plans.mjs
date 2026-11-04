import { PrismaClient } from "@prisma/client";
import { PLANS, planToRecord } from "../app/lib/plans.js";
const prisma = new PrismaClient();
try {
  await prisma.$transaction([
    ...PLANS.map((plan,index) => prisma.plan.upsert({where:{key:plan.key},create:planToRecord(plan,index),update:planToRecord(plan,index)})),
    prisma.plan.updateMany({where:{key:{in:["pro","advanced"]}},data:{active:false}})
  ]);
  console.log("BYOR plans synchronized: Free, Basic, Standard, Premium (USD).");
} finally { await prisma.$disconnect(); }
