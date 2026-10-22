import { getDocumentRequest, type ClientDocFlowItem } from "@/lib/services/backend";

// Where a document request's builder opens. The template page first: it
// needs nothing but the template, which outlives the catalogue service a
// request was started from. The service page only for a row that names a
// service and no template.

const enc = encodeURIComponent;

export const templateBuilderHref = (templateId: string, requestId: string): string =>
  `/portal/client/services/template/${enc(templateId)}?request=${enc(requestId)}`;

export async function builderRouteOf(item: Pick<ClientDocFlowItem, "id" | "templateId" | "service">): Promise<string> {
  if (item.templateId) return templateBuilderHref(item.templateId, item.id);
  const req = await getDocumentRequest(item.id);
  if (req.templateId) return templateBuilderHref(req.templateId, item.id);
  return item.service?.id ? `/portal/client/services/document/${enc(item.service.id)}` : "";
}
