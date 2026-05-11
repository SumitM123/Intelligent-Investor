---
name: auto-research
description: "Automatically triggered whenever documentation, external APIs, or libraries are mentioned but not fully present in context."
---
Whenever this skill is loaded:
1. Search through the ../docs-provider files, and check if the relevant information for the docs is there. If there is, then check if the information is enough for the task at hand. If so, then use that particular .md file, for contexnt, then you don't have to do anything else. If not, then go to the next step.  
2. Immediately invoke the 'researcher' subagent using the 'agent' tool.
2. Provide the subagent with the specific documentation URL or library name.
3. Wait for the subagent to return a summary of its research.
4. Create a new .md file under the '../docs-provider' folder, with an accurate file name, and put in the details 
that are relevant into the file. Follow the format of the '../docs-provider/snaptrade-docs.md' file.
5. Use that researched context to finalize any code edits.
