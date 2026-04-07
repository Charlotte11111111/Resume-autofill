export const resumeSchema = {
  basicInfo: {
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    linkedIn: "",
    website: "",
    github: ""
  },
  education: [
    {
      school: "",
      degree: "",
      major: "",
      startDate: "",
      endDate: "",
      gpa: "",
      description: ""
    }
  ],
  workExperience: [
    {
      company: "",
      title: "",
      location: "",
      startDate: "",
      endDate: "",
      description: ""
    }
  ],
  skills: [""],
  languages: [{ language: "", proficiency: "" }],
  certifications: [{ name: "", issuer: "", date: "" }],
  projects: [{ name: "", role: "", description: "", technologies: [""], url: "" }],
  customFields: {}
};

export function getEmptyResumeData() {
  return JSON.parse(JSON.stringify(resumeSchema));
}
