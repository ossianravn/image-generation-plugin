# Prompting GPT Image 2.6

Source: OpenAI's GPT Image 2.6 prompting guide and image generation guide, checked 10 November 2026. Field names below are this plugin's: `count`, `references`, `markup`, `mask`, and `options.*`.

## Write the prompt as a brief

1. **Start with the deliverable.** Name what the image is and where it will be used: product photo, campaign ad, classroom diagram, pitch slide, app screen, logo, sticker, storyboard panel. Then give the subject, composition, aspect ratio, and placement constraints.
2. **Organise long prompts.** For anything with several requirements, use labelled sections such as Scene, Subject, Details, Style, Text, and Constraints. Plain paragraphs, lists, and JSON-like blocks all work; pick the one that is easiest to read and edit. No special syntax is needed.
3. **Describe what is visible.** Materials, lighting, colours, medium, framing, texture. Say "photorealistic" or "a real photograph" when that is the goal. Camera and lens terms steer the look but are not simulated exactly. For mood (cinematic, rainy, neon, dusk), describe scale, atmosphere, and colour rather than relying on the mood word.
4. **Pin down people and actions.** Body framing ("full body, feet visible"), gaze ("looking at the map"), hands ("both hands on the handlebars"), relative scale, and how they touch objects.
5. **State exclusions.** End with what must not appear: extra text, watermarks, logos, borders, checkerboards, drop shadows, clip art.
6. **Change one thing per turn.** When refining, pass the last output back as the first reference, ask for one change, and repeat the details that must survive. Short follow-ups work, but restate key constraints when the image drifts.

## Choose settings

| Need | Setting |
| --- | --- |
| Speed, drafts, most iteration, GIFs | model `gpt-image-2.6-flare` (the default) |
| Dense or small text, complex layouts, identity or product preservation, precise edits, demanding final assets | model `gpt-image-2.6-sunburst` |
| Fine detail: small lettering, texture, legends, axes, footnotes | raise `options.quality`: `low` for quick drafts, `medium` for most work, `high` for dense text, diagrams, and slides; `xhigh`/`max` only when `high` still falls short |
| How much the model plans and decides on its own | `options.complexity`: omit for the default `high`; `low` for targeted edits where little should change; `medium` or `high` when the prompt leaves design decisions open. A fully specified prompt gains little from higher complexity. |
| Shape | `options.size`: `1024x1024`, `1536x1024` (landscape), `1024x1536` (portrait), `1536x864` (16:9 slide), or `auto`. Custom sizes use multiples of 16 and a ratio from 1:3 to 3:1. |
| Variations | `count` up to 10 for raster output; SVG is always 1 |

Change either quality or complexity between attempts, not both, so the effect is clear. If the layout is right but small text is soft, raise quality and keep complexity. If the layout is wrong, change the prompt or complexity and keep quality.

## Text in images

- Put every required word in quotes, say exactly once, and describe position and typography: `Headline (exact, once): "Fresh Start" — bold sans-serif, centred at the top.`
- Spell unusual names letter by letter if the first result misspells them.
- Add "No other text." Then read every word in the output; models still slip on spelling and placement.
- Use `quality` `medium` or `high` for small text, several fonts, or dense information.
- For slides, charts, and diagrams, supply the real numbers and labels in the prompt. Check every figure in the output, including any the model invented.

## Edits

- **Order references by role.** The first reference is the image being edited. Refer to the rest by position and purpose: "image 2 is the dog to add", "image 3 is the style reference", "images 2 to 4 are the clothing items".
- **Say "change only …", then list what stays.** Name what must be preserved: face and identity, pose, product geometry, label text, layout, camera angle, lighting, shadows, background, colour temperature. For small local edits, also name nearby objects and arrows that must not move.
- **Combining references:** say which element moves, where it goes, how its lighting should match, and that nothing else changes.
- **Style transfer:** say which quality to borrow from the reference (palette, texture, medium, line work) and describe the new subject separately.
- **Identity or product preservation:** list what must not change in detail, then allow exactly one category to change, such as clothing, background, or packaging colour. Ask for matching light, shadows, and colour temperature so the change does not look pasted on. Use Sunburst.
- **Remove an object:** name it precisely and add "do not change anything else".
- **Insert a person into a new scene:** describe framing, gaze, action, lighting, and believable detail, and list the facial features and proportions to keep. Ask for an unstyled, real-photo look if that is wanted; otherwise results drift toward movie-poster lighting.
- **Sketch to render:** keep the drawing's layout, proportions, and perspective, choose materials and lighting that fit it, and add "do not add new elements or text".
- **Translate text in an image:** ask to replace the text in the target language and change nothing else, then check for leftover words in the original language.
- **Swap one object in a real photo:** replace only that object and keep the camera angle, room lighting, contact shadows, and surrounding items.
- **Pixel-identical areas:** the model regenerates the whole image. When part of it must stay exactly the same, composite the approved edit back into the original afterwards.

### Markup

Markup shows where to change; the prompt says what to change.

- Supply `markup`: a PNG annotation layer with transparent pixels and the same width and height as the first reference. Additional references stay references.
- If the user describes a region instead of supplying a layer, draw one with code: read the first reference's size with `inspect_image`, then create a transparent PNG of that size with a bright red circle, outline, or arrow around the target. Never flatten the marks onto the photo.
- Prompt pattern: "Change the [object] inside the red circle to [result]. Keep [details to preserve] unchanged. Remove the red circle from the finished image."
- Start with `options.complexity: "low"`. Markup is available on GPT Image 2.5 and 2.6 and never combines with `mask`.

A `mask` is a softer alternative: the model treats it as guidance and may not follow its exact edge.

## GIF animation

Set `options.output_format: "gif"` on `generate_image` with GPT Image 2.6. GIFs are text-only: no references, mask, or markup. To animate an existing character or product, describe its defining features in words.

- **Describe a loop, not a scene.** Give the subject a clear starting pose, the motion as a short sequence of beats, and a return to the starting pose. End with "Loop seamlessly."
- **Fix the camera.** Say "camera still" or name the single camera move. Keep the background simple and unchanged.
- **Keep the action small and continuous.** One subject with one or two movements (lift, blink, wave, sway, bounce) loops better than many independent actions. Say which objects stay attached to the subject.
- **Settings:** `options.frame_count` 2 to 16 (default 9) and `options.frame_duration_ms` 20 to 2000 (default 200). Loop length is frame count × frame duration; 9 × 200 ms is 1.8 s. More frames give smoother motion; shorter durations play faster. `options.size` is the size of each frame (multiples of 16, or `auto`; `512x512` is a good default).
- All frames share a request pixel budget. If the API rejects the size, reduce `frame_count`, the frame size, or `count`.
- GIF output has no `output_compression`. The saved artifact reports `frames` and `duration_ms`; the preview shows only the first frame, so tell the user to open the file to see the motion.

Example:

```text
A small orange robot with round headlight eyes sits on a wooden desk beside a potted cactus.
Motion: it looks left, blinks twice, gives a short wave with its right hand, then returns to its starting pose facing forward.
Camera still, plain warm-grey background, soft studio light. Loop seamlessly.
```

## SVG

Set `options.output_format: "svg"` on `generate_image` with GPT Image 2.6. `count` must be 1; no references, mask, markup, or `output_compression`.

- Use SVG for marks that must scale or be recoloured: logos, icons, badges, simple illustrations.
- Prompt for vector-friendly art: flat shapes, a strong silhouette, balanced negative space, a small palette, minimal strokes, no gradients unless essential, readable at small and large sizes. Name the brand and the shapes that define the mark.
- For a mark that sits on any surface, set `options.background: "transparent"` and ask for "no backdrop, scenery, or frame".
- `quality` and `complexity` control the raster reference image the API draws first; a separate text model then writes the SVG.
- If the call fails with `SVG_MODEL_REQUIRED`, set `options.svg_model` to an OpenAI text model, such as `gpt-6-astra`, and submit again with a new request ID. That is a new paid request.
- The plugin saves only static SVG, with no scripts or external links, and rejects anything else.

## Transparent raster assets

For a cutout, sticker, or logo that sits on another background: set `options.background: "transparent"` with `output_format` `png` or `webp`, and also ask in the prompt for an isolated subject with clean edges, no halo, and no backdrop, checkerboard, scenery, or shadow. A drawn checkerboard is not transparency: confirm `has_transparent_pixels: true` with `inspect_image`. When editing a transparent asset again, restate that the background must stay transparent.

## Recipes

| Asset | What to put in the prompt |
| --- | --- |
| Photograph | Subject, action, framing and eye level, lens look, light source and time of day, texture and grain, and "candid, unretouched" when realism matters. |
| Infographic or process diagram | The process, the audience, every step or component in order, required labels, and what to leave out. Verify labels and relationships. |
| Classroom or scientific visual | Audience, learning goal, required parts and labels, flat consistent icon style, clear arrows, white space, and "no tiny text". Use `quality: "high"`. |
| Slide, chart, or report page | The exact deliverable and canvas, title, real data and labels, hierarchy, typeface style, and "no clip art, stock photos, or decoration". Use a landscape size and `quality: "high"`. |
| Advertisement or poster | Brand, audience, scene, quoted tagline exactly once, visual direction, and "no other text, logos, or watermarks". |
| Logo | Original, non-infringing mark for the named brand; feeling; defining shapes; simplicity; centred with padding; transparent background. Use SVG for a vector, or PNG with `background: "transparent"` and `count` > 1 for variations. |
| App or web interface | Describe the product as if it ships: screen, header, real content, hierarchy, spacing, palette, and device frame. Avoid concept-art words. |
| Comic or storyboard | Number of panels and orientation, then one concrete visual beat per panel. |
| Historical scene | Place and date; ask for period-accurate clothing and surroundings, then check them. |
| Card, packaging, or merchandise | Scene, mood, materials and print finish, lighting, "original design, no trademarks", and the exact text verbatim. |
| Character across scenes | First image: a character sheet (appearance, proportions, outfit, palette, style) on a plain background. Later images: pass it as a reference, describe the new scene, and list the traits that must stay the same with "do not redesign the character". |

## Check the result

Before presenting an image as finished, inspect it with `inspect_image` and check:

- Every word is readable and matches the requested text; diagram labels and relationships are correct.
- Identities, product shapes, labels, and reference details survived.
- An edit changed only what was asked.
- Transparency is real (`has_transparent_pixels`), and GIF frame count and duration match the request.

Report anything that falls short and suggest one narrow follow-up, such as a quoted text correction, higher quality, or Sunburst. Each attempt is a new paid request.
