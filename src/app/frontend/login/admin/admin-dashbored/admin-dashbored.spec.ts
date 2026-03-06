import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminDashbored } from './admin-dashbored';

describe('AdminDashbored', () => {
  let component: AdminDashbored;
  let fixture: ComponentFixture<AdminDashbored>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashbored]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminDashbored);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
