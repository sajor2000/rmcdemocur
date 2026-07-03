import { Sidebar } from "@/components/layout/Sidebar";
import { getCourseWithDocuments } from "@/lib/queries";
import { DEMO_CASES } from "@/lib/demo-data";

type CaseItem = {
  id: number;
  caseNumber: number;
  caseTitle: string | null;
  diagnosis?: string | null;
};

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { courseId: string };
}) {
  let course = {
    id: 1,
    code: "RMD 563",
    title: "Food to Fuel",
    director: "Dr. Kathryn Solka, PhD",
  };
  let docs: CaseItem[] = DEMO_CASES.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    caseTitle: c.caseTitle,
    diagnosis: c.diagnosis,
  }));

  try {
    const data = await getCourseWithDocuments(Number(params.courseId));
    if (data.course) {
      course = {
        id: data.course.id,
        code: data.course.code,
        title: data.course.title,
        director: data.course.director ?? "",
      };
      docs = data.documents.map((d) => ({
        id: d.id,
        caseNumber: d.caseNumber ?? 0,
        caseTitle: d.caseTitle,
        diagnosis: d.diagnosis,
      }));
    }
  } catch {
    // Demo fallback without DATABASE_URL
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <Sidebar
        courseId={course.id}
        courseCode={course.code}
        courseTitle={course.title}
        director={course.director}
        cases={docs}
      />
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}
