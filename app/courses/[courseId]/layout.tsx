import { Sidebar } from "@/components/layout/Sidebar";
import { dedupeCaseList, getCourseWithDocuments } from "@/lib/queries";

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

  const docs =
    data?.documents != null
      ? dedupeCaseList(data.documents).map((d) => ({
          id: d.id,
          caseNumber: d.caseNumber ?? 0,
          caseTitle: d.caseTitle,
          diagnosis: d.diagnosis,
        }))
      : [];

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <Sidebar
        courseId={course.id}
        courseCode={course.code}
        courseTitle={course.title}
        director={course.director ?? ""}
        cases={docs}
      />
      {/* Extra top padding below lg clears the fixed "Menu" drawer toggle. */}
      <div className="flex-1 overflow-auto p-6 max-lg:pt-16">{children}</div>
    </div>
  );
}
