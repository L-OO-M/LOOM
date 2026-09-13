export function recommendResources({ resources, currentNode, domain, level, minutesAvailable = 45 }) {
  return resources
    .filter((resource) => resource.domain === domain || resource.nodeId === currentNode?.id)
    .filter((resource) => resource.level === level || resource.level === "foundation")
    .filter((resource) => resource.minutes <= minutesAvailable)
    .sort((a, b) => {
      if (a.nodeId === currentNode?.id && b.nodeId !== currentNode?.id) return -1;
      if (b.nodeId === currentNode?.id && a.nodeId !== currentNode?.id) return 1;
      return a.minutes - b.minutes;
    })
    .slice(0, 3);
}
