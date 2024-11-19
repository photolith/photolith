# Photolith course outline

Notes on what should happen in a course on Photolith, running through all functionality.

## Prerequisites

* [ ] Set of physical slides to take photos of
* [ ] Set of sample images with slide labels known to work
* [ ] A user that can perform all actions (probably the admin user)
* [ ] Search query for individuals with already populated annotations
* [ ] Example closed project with some annotations already in

## Ingest

### Photolith introduction

Photolith aims to:

* Streamline image digitization & cataloging
  * Integrated with landings database, automatically extracts metadata based on slide label
  * Mark up individuals within an image
* Allowing manual age-reading to be done on computer
  * As part of a general age reading workflow
  * As part of a "project", for repeated age-reading experiments
* Export of age reading data to other systems
* As a stepping-stone towards AI-based age reading

UI quick introduction:

* Photolith is web based, need the URL
* Need a login before you can do anything
* User menu, lets you change language & password
* Documentation link, in both English & Icelandic

Camera setup:

* Physical apparatus, what plugs in where
* Digicamcontrol, installation, startup
* Lighting, focus

### Ingesting into Photolith

Basics:

* Login, head to ingest
* Choosing image sources (directory) - choose directory digicamcontrol created
* Image viewer:
  * Can zoom with scroll-wheel
  * Can pan by dragging, use right mouse button to not drag items on image
  * Enhancement options: Increase gamma to bring out chalk marks. NB: These don't alter the image, just your view
  * Use arrow button to maximise view, select "Ingest" to bring back
* Help tab explains what you can do

Scale:

* Why do we need a scale? 
* Positioning the end points
* Tell Photolith how long you've selected (hint: aim for more rather than less)

Slide individuals:

* Enter text from slide in box
  * Accept various formats, as listed on right hand side
  * We now have each individual in the sample represented as a box
* The individual boxes need to match up with the individuals in the image
  * Can move & resize each box
  * Can ctrl-drag to select multiple, and move as a group
  * Use edge boxes to resize, to cover individual
  * Bigger is better than smaller
* Photolith will by default add all to the slide
  * If some aren't present, drag to outside image
  * If the slide only contains one of the individuals, select it to the right of the slide ID

Slide metadata:

* Select an individual, the metadata appears on right
* Available metadata now on right hand side
* We can add to it by using the "Add" dropdown
* "Copy to all individuals" will copy new items to all individuals

Moving on:

* Click save, can click the link in the pop-up to view the individuals created
* Or click "Next Image" to move to the next image, we remember slide label from previous assuming it will be similar

## Annotation

Start off by searching for individuals:

* Login, head to "search" tab
* Put in something to search for
  * Fill in any filter to find results for that species (e.g)
  * Use the "+" button to search for multiple species
  * Click Apply
  * Can return to filters by clicking funnel
* Click each entry & expands to show image, & annotations
* Can click to start annotating

Similar interface to before:

* Instead if image sources, top bar now individuals within your search
  * Can go previous next, or return to search
* Metadata tab allows you to see metadata from ingest (i.e month it was caught)
* Have same image controls
  * Can zoom image by scrolling (scrollwheel / 2 fingers on touchpad up & down)
  * Can pan by dragging (click and move)
  * Use arrow button to maximise view, select "Ingest" to bring back
  * Image enhancements here too, reducing gamma can help

Existing annotations:

* Existing annotations allows you to see other annotations
* Can select each to view one
* Can copy to create our own

Creating an annotation:

* Drag ends of axis to center and edge
* Double click rings to add points
* Can drag them about to adjust
* By default we snap to axis, but we can turn that off
* Double click nodes to delete them

Fill in form:

* Age reading automatically populated
* Image rating self-explatory
* Reader authority; could be a species expert, could have a slide image handy

Moving on:

* Press "Save" when done, and "Next >" to move on.
* Can select "return to search" in dropdown

## Projects

What is a project:

* Separate annotation mode for a group of users to perform annotation
* Project age-readings only visible in project
* Other age-readings not visible whilst within project
  * Allows repeated age-reading experiments, to find bias
* Users can only be allowed to see projects, so students e.g. could be added to only age-read on a project

Making a project:

* A search can be turned into a project
* Assigned a team (a group of users)
* Recycling axis from an annotation done by a user
* End date, after which results are fixed

Participating in a project:

* Click on "Projects", see projects I'm part of,
* Choose one, can annotate just as before, but don't get to see existing annotations

Project end:

* Can see all annotations as we did with search
* Admin can choose one to be considered the general annotation for that individual

## Administration

Users:

* Creating a user manually, use "ADD USER +"
* Activating a user, use "Activate / Password reset"
* Edit user
  * Set groups
  * Set species expert
  * Add to teams, or use Teams page to bulk-add

Other stuff:

* Taxonomies
  * Filled in as we import data, but extra fields can be added
* Images / Individuals allow you to permanently delete mistaken uploads
