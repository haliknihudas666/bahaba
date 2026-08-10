# PixelDiary

Whimsical, personal, scrapbook-like.

## Overview

PixelDiary is a design system for personal photo blogs and visual journals that captures the tactile warmth of a handmade scrapbook. Playful handwritten headings, pastel accent colors, and rounded corners create an approachable, diary-like atmosphere. The spacious density ensures photos remain the star while subtle layered shadows give elements a pasted-onto-the-page quality. It is joyful, intimate, and unapologetically personal.

## Colors

### Brand Palette

| Token     | Hex       | Role                                          |
|-----------|-----------|------------------------------------------------|
| Primary   | `#F97171` | Coral — CTAs, hearts, key highlights           |
| Secondary | `#C4B5FD` | Lavender — tags, categories, decorative accent |
| Tertiary  | `#A7F3D0` | Mint — success states, photo frames, accents   |
| Neutral   | `#D6D3D1` | Warm Gray — borders, muted UI, dividers        |

### Surface Palette

| Token          | Hex       | Role                                  |
|----------------|-----------|----------------------------------------|
| Background     | `#FFF7ED` | Warm pastel base                       |
| Surface        | `#FFFFFF` | Cards, photo frames, modals            |
| Surface Raised | `#FFFBEB` | Sticky nav, floating action buttons    |

### Content Palette

| Token          | Hex       | Role                                  |
|----------------|-----------|----------------------------------------|
| Text Primary   | `#292524` | Headings, captions, main content       |
| Text Secondary | `#78716C` | Descriptions, dates, metadata          |
| Text Tertiary  | `#D6D3D1` | Placeholders, subtle hints             |

### Border Palette

| Token         | Hex       |
|---------------|-----------|
| Border Subtle | `#F5F5F4` |
| Border Medium | `#E7E5E4` |
| Border Strong | `#D6D3D1` |

### Semantic Colors

| Token   | Hex       |
|---------|-----------|
| Success | `#16A34A` |
| Warning | `#F59E0B` |
| Error   | `#EF4444` |
| Info    | `#6366F1` |

## Typography

### Font Stack

| Role             | Font    | Fallbacks                                    |
|------------------|---------|-----------------------------------------------|
| Display/Headings | Caveat  | "Comic Sans MS", "Segoe Print", cursive      |
| UI/Body          | DM Sans | "Helvetica Neue", Arial, sans-serif          |
| Mono/Code        | Fira Code| "Courier New", Courier, monospace            |

### Type Scale

| Token       | Font    | Size  | Weight | Line Height | Letter Spacing | Usage                          |
|-------------|---------|-------|--------|-------------|----------------|--------------------------------|
| Display     | Caveat  | 48px  | 700    | 1.1         | 0              | Hero titles, journal covers    |
| Headline    | Caveat  | 36px  | 700    | 1.2         | 0              | Post titles, album names       |
| Subhead     | Caveat  | 28px  | 400    | 1.3         | 0              | Section headers, date headers  |
| Body Large  | DM Sans | 18px  | 400    | 1.7         | 0.01em         | Journal entries, long captions |
| Body        | DM Sans | 16px  | 400    | 1.6         | 0.01em         | Default paragraph text         |
| Body Small  | DM Sans | 14px  | 400    | 1.5         | 0.01em         | Photo metadata, EXIF info      |
| Caption     | DM Sans | 12px  | 500    | 1.4         | 0.02em         | Timestamps, location tags      |
| Overline    | DM Sans | 11px  | 600    | 1.5         | 0.06em         | Album labels, "FAVORITES"      |
| Code        | Fira Code| 14px | 400    | 1.6         | 0              | Embed codes, file names        |

## Spacing

- **Base unit:** 8px
- **Scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80
- **Component padding (small):** 8px 12px
- **Component padding (medium):** 12px 16px
- **Component padding (large):** 16px 24px
- **Section spacing (mobile):** 48px
- **Section spacing (tablet):** 64px
- **Section spacing (desktop):** 80px

## Border Radius

| Token  | Value    | Usage                                  |
|--------|----------|----------------------------------------|
| None   | 0px      | Full-bleed hero images                 |
| Small  | 8px      | Buttons, inputs, small containers      |
| Medium | 12px     | Dropdowns, tooltips                    |
| Large  | 16px     | Cards, photo frames, modals            |
| XL     | 24px     | Feature panels, album covers           |
| Full   | 9999px   | Tags, avatars, pill buttons            |

## Shadows

**Philosophy:** Subtle shadows that create a scrapbook layering effect — elements feel gently placed on the page, slightly lifted like paper cutouts.

| Token   | CSS Value                                                           |
|---------|----------------------------------------------------------------------|
| Subtle  | `0 2px 4px rgba(41, 37, 36, 0.06)`                                  |
| Medium  | `0 4px 8px rgba(41, 37, 36, 0.08), 0 1px 2px rgba(41, 37, 36, 0.04)` |
| Large   | `0 8px 16px rgba(41, 37, 36, 0.10), 0 2px 4px rgba(41, 37, 36, 0.04)` |
| Overlay | `0 12px 24px rgba(41, 37, 36, 0.14), 0 4px 8px rgba(41, 37, 36, 0.06)` |

**Special:** Photo cards use `0 4px 12px rgba(41, 37, 36, 0.08)` with a 2-3 degree CSS rotation for a scattered scrapbook feel.

## Components

### Buttons

**Primary**
- Background: `#F97171`
- Text: `#FFFFFF`
- Border: none
- Radius: 8px
- Font: DM Sans 600
- Hover: `#F84B4B`
- Active: `#E11D48`

**Secondary**
- Background: `#FFFFFF`
- Text: `#F97171`
- Border: 2px solid `#F97171`
- Radius: 8px
- Hover background: `#FFF1F2`

**Ghost**
- Background: transparent
- Text: `#F97171`
- Border: none
- Hover background: `#FFF7ED`

**Destructive**
- Background: `#EF4444`
- Text: `#FFFFFF`
- Border: none
- Hover: `#DC2626`

**Sizes:** Small 32px / Medium 40px / Large 48px height
**Disabled:** Opacity 0.5, cursor not-allowed

### Cards

**Default**
- Background: `#FFFFFF`
- Border: 1px solid `#E7E5E4`
- Radius: 16px
- Padding: 16px
- Shadow: `0 2px 4px rgba(41, 37, 36, 0.06)`
- Hover: shadow `0 4px 8px rgba(41, 37, 36, 0.08), 0 1px 2px rgba(41, 37, 36, 0.04)`

**Elevated**
- Background: `#FFFFFF`
- Border: none
- Radius: 16px
- Padding: 24px
- Shadow: `0 4px 8px rgba(41, 37, 36, 0.08), 0 1px 2px rgba(41, 37, 36, 0.04)`
- Hover: shadow `0 8px 16px rgba(41, 37, 36, 0.10), 0 2px 4px rgba(41, 37, 36, 0.04)`, transform translateY(-2px)

### Inputs

**Text Input**
- Background: `#FFFFFF`
- Border: 2px solid `#E7E5E4`
- Text: `#292524`
- Placeholder: `#D6D3D1`
- Radius: 8px
- Padding: 10px 14px
- Height: 44px
- Focus: border-color `#C4B5FD`, box-shadow `0 0 0 3px rgba(196, 181, 253, 0.25)`
- Error: border-color `#EF4444`, box-shadow `0 0 0 3px rgba(239, 68, 68, 0.15)`
- Disabled: background `#F5F5F4`, opacity 0.5

**Label:** DM Sans 500, 14px, color `#292524`, margin-bottom 6px
**Helper text:** DM Sans 400, 12px, color `#78716C`

### Chips

**Filter Chip**
- Background: `#FFFFFF`
- Text: `#78716C`
- Border: 1.5px solid `#E7E5E4`
- Radius: 9999px
- Padding: 6px 14px
- Font: DM Sans 500, 13px
- Selected: background `#C4B5FD`, text `#FFFFFF`, border-color `#C4B5FD`
- Hover: border-color `#D6D3D1`

**Status Chip**
- Published: background `#D1FAE5`, text `#16A34A`, border none, radius 9999px
- Draft: background `#F5F5F4`, text `#78716C`, border none, radius 9999px
- Favorite: background `#FFE4E6`, text `#F97171`, border none, radius 9999px
- Private: background `#EDE9FE`, text `#6366F1`, border none, radius 9999px

### Lists

**Default List Item**
- Height: 52px
- Padding: 12px 16px
- Font: DM Sans 400, 16px
- Divider: 1px dashed `#E7E5E4`
- Hover: background `#FFFBEB`
- Selected: background `#FFF1F2`, left border 3px solid `#F97171`
- Icon variant: 24px icon, 12px gap before text

### Checkboxes

- Size: 22px
- Border: 2px solid `#D6D3D1`
- Radius: 6px
- Checked: background `#F97171`, border-color `#F97171`, checkmark `#FFFFFF`
- Indeterminate: background `#F97171`, dash `#FFFFFF`
- Disabled: opacity 0.5
- Label: DM Sans 400, 16px, 10px gap

### Radio Buttons

- Size: 22px
- Border: 2px solid `#D6D3D1`
- Selected: border-color `#F97171`, inner dot `#F97171` (12px)
- Disabled: opacity 0.5
- Label: DM Sans 400, 16px, 10px gap

### Tooltips

- Background: `#292524`
- Text: `#FFFFFF`
- Font: DM Sans 400, 13px
- Padding: 8px 14px
- Radius: 12px
- Max width: 220px
- Arrow: 6px
- Delay: 250ms
- Position: top (default)

## Do's and Don'ts

1. **Do** let photos be the largest elements on every page — text supports the imagery, not the other way around.
2. **Don't** use more than two accent colors (Coral, Lavender, Mint) together in a single view — pick one primary and one supporting.
3. **Do** use Caveat handwritten font only for headings and short labels — never for body paragraphs.
4. **Don't** use sharp corners (0px radius) on cards or containers — rounded shapes are core to the personality.
5. **Do** apply subtle CSS rotation (1-3 degrees) to scattered photo grids for an authentic scrapbook feel.
6. **Do** use dashed dividers instead of solid ones to maintain the hand-crafted, informal tone.
7. **Don't** set body text below 16px — the casual aesthetic should not compromise readability.
8. **Do** use pill-shaped tags (`border-radius: 9999px`) for all categories, hashtags, and labels.
9. **Don't** use heavy font weights (800-900) — the whimsical voice is best served by regular (400) and semi-bold (600).
10. **Do** include heart/favorite iconography as the primary engagement action — it matches the personal, diary-like tone.