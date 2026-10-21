export async function loadSections(sections) {
  const outcomes = await Promise.allSettled(sections.map(async ([name, request, apply]) => {
    const response = await request();
    apply(response.data);
    return name;
  }));
  return outcomes.flatMap((result, index) => result.status === 'rejected' ? [sections[index][0]] : []);
}
