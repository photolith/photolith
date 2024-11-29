Users
=====

Creating & activating users
---------------------------

Either users can request an account, or accounts can be created by administrators.

Approving account requests
^^^^^^^^^^^^^^^^^^^^^^^^^^

Anyone can request an account by filling in their details on the "Sign up" page.
However, they cannot use the system until activated by an administrator.

1. Ask new users to fill in the "Sign up" form if they haven't already
2. Go to the "Users" page in site administration
3. Filter "By active" "No" in the right-hand "Filter" panel
4. Check the checkbox next to any user you wish to activate
5. Select "Activate / password reset" from the action dropdown
6. Press "Go"

The new user will then receive an e-mail which they can use to reset their password,
and set a new one.
At this point they can log in.

Manually creating accounts
^^^^^^^^^^^^^^^^^^^^^^^^^^

Administrators can create new users and set their password.

1. Go to the "Users" page in site administration
2. Click the "ADD USER +" button on the right
3. Fill in new account details, assign them a password

Now either tell the new user their initial username or password,
or trigger "Activate / password reset" as above so they get e-mailed a link.

User permissions
----------------

A new user cannot do anything in Photolith, until an administrator edits the user.
Add permissions by editing the user in the site administration page.

Ingest/Upload new images
^^^^^^^^^^^^^^^^^^^^^^^^

The **Ingest** group activates the ingest tab, which allows that user to upload new images to the database.

In the "Groups" section, add the group by clicking the arrow that moves it to "Chosen groups".

General annotations
^^^^^^^^^^^^^^^^^^^

The **General Annotation Viewer** and **General Annotation Editor** groups allow a user to view/add annotations outside a project.

In the "Groups" section, add the group by clicking the arrow that moves it to "Chosen groups".

Project teams
^^^^^^^^^^^^^

To participate in a project, a user needs to be part of a project team.

In the "Teams" section, select "Add another Team" and select the team from the dropdown.

User annotation authority / species experts
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

When considering multiple annotations, readers that are more expert will be considered before other readers (e.g. inexperienced or atuomated readers).

The user's default reader authority can be set in the "User Profile" section.
An account for an automated age reader should be "Automated reader", a student "Inexperienced", etc.

A user can have a different authority for a particular species, by adding an entry under "User species authorities".
Click "Add another User species authority", select the Species in question and then select "Expert", e.g.

Project administrators
^^^^^^^^^^^^^^^^^^^^^^

The **Project Admin** group allows the user to create new projects.

In the "Groups" section, add the group by clicking the arrow that moves it to "Chosen groups".
