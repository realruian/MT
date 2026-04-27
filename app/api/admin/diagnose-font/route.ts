import { NextRequest } from "next/server";
import { getFontScan } from "@/lib/font-scan";
import {
  familyToAggregationKey,
  normalizeWeight,
} from "@/lib/font-aggregation";

/** 临时诊断：?key=FZLanTingHeiS-GB 列出该聚合 key 下所有 face 的元信息 */
export async function GET(req: NextRequest) {
  const targetKey = req.nextUrl.searchParams.get("key");
  const scan = await getFontScan();
  const rows = scan.faces
    .map((face) => {
      const key = familyToAggregationKey(face.family);
      const weight = normalizeWeight(
        face.family,
        face.subfamily,
        face.usWeightClass,
        face.postscriptName,
      );
      return {
        aggregationKey: key,
        weight,
        psName: face.postscriptName,
        family: face.family,
        subfamily: face.subfamily,
        usWeightClass: face.usWeightClass,
        filename: face.filename,
      };
    })
    .filter((r) => !targetKey || r.aggregationKey === targetKey);

  return Response.json({
    target: targetKey,
    count: rows.length,
    rows,
  });
}
