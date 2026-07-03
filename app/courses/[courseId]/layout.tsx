import { Sidebar } from "@/components/layout/Sidebar";
import { getCourseWithDocuments } from "@/lib/queries";

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
  const courseId = Number(params.courseId);
  const data = await getCourseWithDocuments(courseId).catch(() => null);

  const course = data?.course ?? {
    id: courseId,
    code: "RMD 563",
    title: "Food to Fuel",
    director: "",
  };

  const docs: CaseItem[] =
    data?.documents.map((d) => ({
      id: d.id,
      caseNumber: d.caseNumber ?? 0,
      caseTitle: d.caseTitle,
      diagnosis: d.diagnosis,
    })) ?? [];

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <Sidebar
        courseId={course.id}
        courseCode={course.code}
        courseTitle={course.title}
        director={course.director ?? ""}
        cases={docs}
      />
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}
