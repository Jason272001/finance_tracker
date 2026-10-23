const categories={Overview:'Overview','Analyst preview':'Overview',Staff:'Team','Staff schedule':'Team','Time clock & payroll':'Team',Meetings:'Team',Tasks:'Team',Branches:'Team','Budgets & expenses':'Finance','Tax preparation':'Finance',Marketing:'Marketing'};
async function businessTab(page,name){await page.getByRole('navigation',{name:'Business categories'}).getByRole('button',{name:categories[name],exact:true}).click();await page.getByRole('navigation',{name:'Business hub sections'}).getByRole('button',{name,exact:true}).click();}
module.exports={businessTab};
