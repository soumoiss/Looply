// Prevent any accidental Story publication from form submits, Enter in music
// search, modal controls, audience selection, IME composition or input changes.
// Only click actions on explicit Publish buttons can start a request.
export const STORY_PUBLISH_SELECTORS =
  "[data-studio-publicar],[data-studio-publish-friends],[data-share-public]";
export function isExplicitStoryPublishGesture(event) {
  if(event?.type!=="click" || !event.target?.closest)return false;
  const button=event.target.closest(STORY_PUBLISH_SELECTORS);
  return Boolean(button && !button.disabled);
}
export function preventImplicitStorySubmit(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return false;
}
